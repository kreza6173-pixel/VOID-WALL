package io.github.kreza6173pixel.voidwall.exec

import android.os.Bundle
import java.io.InputStream
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class ShizukuExecService : IUserService.Stub() {
    private val lock = Any()
    private val drains = Executors.newCachedThreadPool()
    private val running = AtomicReference<Process?>(null)

    override fun exec(command: String?, timeoutMs: Int): Bundle = synchronized(lock) {
        val cmd = command.orEmpty()
        if (cmd.isBlank()) return@synchronized result(2, "", "empty command", false)
        val p = try { ProcessBuilder("/system/bin/sh", "-c", cmd).redirectErrorStream(false).start() }
        catch (e: Exception) { return@synchronized result(127, "", e.toString(), false) }
        p.outputStream.close()
        running.set(p)
        val out = StringBuilder(); val err = StringBuilder()
        val of = drains.submit { drain(p.inputStream, out) }
        val ef = drains.submit { drain(p.errorStream, err) }
        var timedOut = false
        try {
            if (!p.waitFor(timeoutMs.toLong().coerceIn(250, 120000), TimeUnit.MILLISECONDS)) {
                timedOut = true; p.destroy(); if (!p.waitFor(500, TimeUnit.MILLISECONDS)) p.destroyForcibly()
            }
        } finally { running.compareAndSet(p, null) }
        runCatching { of.get(2000, TimeUnit.MILLISECONDS) }; runCatching { ef.get(2000, TimeUnit.MILLISECONDS) }
        result(if (timedOut) 124 else p.exitValue(), out.toString(), err.toString(), timedOut)
    }

    override fun cancel() { running.get()?.destroy() }
    override fun destroy() { cancel(); drains.shutdownNow(); System.exit(0) }

    private fun drain(stream: InputStream, sink: StringBuilder) {
        runCatching {
            stream.bufferedReader().use { r -> val buf = CharArray(4096); var n: Int
                while (r.read(buf).also { n = it } >= 0) { synchronized(sink) { if (sink.length < 65536) sink.append(buf, 0, minOf(n, 65536 - sink.length)) } }
            }
        }
    }
    private fun result(code: Int, out: String, err: String, truncated: Boolean) = Bundle().apply {
        putInt("exitCode", code); putString("stdout", out); putString("stderr", err); putBoolean("truncated", truncated)
    }
}
