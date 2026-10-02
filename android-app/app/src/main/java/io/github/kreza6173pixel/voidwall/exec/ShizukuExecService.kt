package io.github.kreza6173pixel.voidwall.exec

import android.os.Bundle
import java.util.concurrent.TimeUnit

class ShizukuExecService : IUserService.Stub() {
    private var process: Process? = null
    override fun exec(command: String?, timeoutMs: Int): Bundle {
        val p = try { ProcessBuilder("/system/bin/sh", "-c", command.orEmpty()).start() }
        catch (e: Exception) { return result(127, "", e.toString()) }
        process = p
        return try {
            p.outputStream.close()
            val done = p.waitFor(timeoutMs.toLong().coerceIn(250, 120000), TimeUnit.MILLISECONDS)
            if (!done) { p.destroy(); result(124, p.inputStream.readBytes().decodeToString(), "timeout") }
            else result(p.exitValue(), p.inputStream.readBytes().decodeToString(), p.errorStream.readBytes().decodeToString())
        } finally { process = null }
    }
    override fun cancel() { process?.destroy() }
    override fun destroy() { cancel(); System.exit(0) }
    private fun result(code: Int, out: String, err: String) = Bundle().apply { putInt("exitCode", code); putString("stdout", out); putString("stderr", err) }
}
