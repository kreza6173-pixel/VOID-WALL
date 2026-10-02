package io.github.kreza6173pixel.voidwall.exec

import android.content.ComponentName
import android.content.Context
import android.content.ServiceConnection
import android.os.IBinder
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import rikka.shizuku.Shizuku
import java.util.concurrent.Executors

enum class ConnectionState { DISCONNECTED, CONNECTING, CONNECTED }
data class ExecResult(val exitCode: Int, val stdout: String, val stderr: String)

class ExecBridge(private val context: Context) {
    var state by mutableStateOf(ConnectionState.DISCONNECTED); private set
    private var service: IUserService? = null
    private val executor = Executors.newSingleThreadExecutor()
    private val args by lazy { Shizuku.UserServiceArgs(ComponentName(context, ShizukuExecService::class.java)).daemon(false).debuggable(false).processNameSuffix("user_service").version(2) }
    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) { service = binder?.let { IUserService.Stub.asInterface(it) }; state = if (service != null) ConnectionState.CONNECTED else ConnectionState.DISCONNECTED }
        override fun onServiceDisconnected(name: ComponentName?) { service = null; state = ConnectionState.DISCONNECTED }
    }
    fun connect() { if (service != null || state == ConnectionState.CONNECTING) return; state = ConnectionState.CONNECTING; runCatching { Shizuku.bindUserService(args, connection) }.onFailure { state = ConnectionState.DISCONNECTED } }
    fun disconnect() { runCatching { Shizuku.unbindUserService(args, connection, true) }; service = null; state = ConnectionState.DISCONNECTED }
    fun exec(command: String, callback: (ExecResult) -> Unit) { val s = service ?: return callback(ExecResult(127, "", "not connected")); executor.execute { val b = runCatching { s.exec(command, 15000) }.getOrNull(); callback(ExecResult(b?.getInt("exitCode", 255) ?: 127, b?.getString("stdout").orEmpty(), b?.getString("stderr").orEmpty())) } }
}
