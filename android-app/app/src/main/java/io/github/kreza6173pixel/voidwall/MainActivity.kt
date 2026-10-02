package io.github.kreza6173pixel.voidwall

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import rikka.shizuku.Shizuku
import io.github.kreza6173pixel.voidwall.exec.*

class MainActivity : ComponentActivity() {
    private val bridge by lazy { ExecBridge(applicationContext) }
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); setContent { VoidWallTheme { WallHome(bridge) } } }
    override fun onResume() { super.onResume(); bridge.connect() }
    override fun onDestroy() { bridge.disconnect(); super.onDestroy() }
}

@Composable private fun WallHome(bridge: ExecBridge) {
    var output by remember { mutableStateOf("Awaiting Shizuku connection…") }
    var chain by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("VOID//WALL", style = MaterialTheme.typography.headlineLarge, color = Color(0xFF00E5FF))
        Text("Native firewall control for Android", color = Color(0xFF7480A8))
        Card { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("CHAIN 3", style = MaterialTheme.typography.titleLarge)
            Text(if (chain) "ENABLED" else "DISABLED", color = if (chain) Color(0xFF4DFFB0) else Color(0xFFFF4D6D))
            Button(onClick = { val next = !chain; bridge.exec("cmd connectivity set-chain3-enabled $next") { result -> chain = next; output = result.stdout.ifBlank { result.stderr } } }) { Text(if (chain) "Disable firewall" else "Enable firewall") }
        } }
        OutlinedButton(onClick = { bridge.exec("id") { result -> output = result.stdout.ifBlank { result.stderr } } }) { Text("Test Shizuku") }
        Text(output, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, color = Color(0xFFE4E9F7))
    }
}

@Composable private fun VoidWallTheme(content: @Composable () -> Unit) {
    val scheme = darkColorScheme(background = Color(0xFF05060A), surface = Color(0xFF0A0C14), primary = Color(0xFF00E5FF), secondary = Color(0xFFFF2BD6), error = Color(0xFFFF4D6D), onBackground = Color(0xFFE4E9F7), onSurface = Color(0xFFE4E9F7))
    MaterialTheme(colorScheme = scheme, content = content)
}
