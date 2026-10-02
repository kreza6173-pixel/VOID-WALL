package io.github.kreza6173pixel.voidwall.exec

import android.content.ComponentName
import android.content.Context
import android.content.ServiceConnection
import android.content.pm.ApplicationInfo
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import rikka.shizuku.Shizuku

class ExecBridge(private val context: Context) {
    var state by mutableStateOf(ConnectionState.DISCONNECTED); private set
    var log by mutableStateOf(listOf<String>()); private set
    private var service: IUserService? = null
    private val handler = Handler(Looper.getMainLooper())
    private val args by lazy { Shizuku.UserServiceArgs(ComponentName(context, ShizukuExecService::class.java)).daemon(false).debuggable((context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0).processNameSuffix("user_service").version(2) }
    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) { service = binder?.takeIf { it.pingBinder() }?.let { IUserService.Stub.asInterface(it) }; state = if (service != null) ConnectionState.CONNECTED else ConnectionState.DISCONNECTED; note("connected=$state") }
        override fun onServiceDisconnected(name: ComponentName?) { service = null; state = ConnectionState.DISCONNECTED; note("service disconnected") }
    }
    fun connect() { if (service != null || state == ConnectionState.CONNECTING) return; if (!Shizuku.pingBinder()) { state = ConnectionState.DISCONNECTED; return }; state = ConnectionState.CONNECTING; note("binding user service"); runCatching { Shizuku.bindUserService(args, connection) }.onFailure { state = ConnectionState.DISCONNECTED; note("bind failed: ${it.javaClass.simpleName}") } }
    fun disconnect() { handler.removeCallbacksAndMessages(null); runCatching { Shizuku.unbindUserService(args, connection, true) }; service = null; state = ConnectionState.DISCONNECTED }
    fun exec(command: String, callback: (ExecResult) -> Unit) { val s = service ?: return callback(ExecResult(127, "", "not connected", false)); Thread { val b = runCatching { s.exec(command, 15000) }.getOrNull(); val r = ExecResult(b?.getInt("exitCode", 255) ?: 127, b?.getString("stdout").orEmpty(), b?.getString("stderr").orEmpty(), b?.getBoolean("truncated", false)); handler.post { callback(r) } }.start() }
    fun cancel() { runCatching { service?.cancel() } }
    private fun note(value: String) { log = (log + value).takeLast(20) }
}

enum class ConnectionState { DISCONNECTED, CONNECTING, CONNECTED }
data class ExecResult(val exitCode: Int, val stdout: String, val stderr: String, val truncated: Boolean)
