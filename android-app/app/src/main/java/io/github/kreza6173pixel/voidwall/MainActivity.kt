package io.github.kreza6173pixel.voidwall

import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import io.github.kreza6173pixel.voidwall.exec.*
import rikka.shizuku.Shizuku
import java.util.Locale

class MainActivity : ComponentActivity() {
    private val bridge by lazy { ExecBridge(applicationContext) }
    override fun attachBaseContext(base: Context) { Locale.setDefault(Locale.US); val c = Configuration(base.resources.configuration); c.setLocale(Locale.US); c.setLayoutDirection(Locale.US); super.attachBaseContext(base.createConfigurationContext(c)) }
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); setContent { VoidWallTheme { WallHome(bridge) } } }
    override fun onResume() { super.onResume(); if (Shizuku.pingBinder() && Shizuku.checkSelfPermission() != android.content.pm.PackageManager.PERMISSION_GRANTED) runCatching { Shizuku.requestPermission(1) }; bridge.connect() }
    override fun onDestroy() { bridge.disconnect(); super.onDestroy() }
}

@Composable private fun WallHome(bridge: ExecBridge) {
    var chain by remember { mutableStateOf<Boolean?>(null) }
    var output by remember { mutableStateOf("Waiting for Shizuku…") }
    LaunchedEffect(bridge.state) { if (bridge.state == ConnectionState.CONNECTED) bridge.exec("cmd connectivity get-chain3-enabled") { r -> output = r.stdout.ifBlank { r.stderr }; chain = output.trim().equals("true", true) } }
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("VOID//WALL", style = MaterialTheme.typography.headlineLarge, color = Color(0xFF00E5FF))
        Text("NATIVE FIREWALL CONTROL", style = MaterialTheme.typography.labelLarge, color = Color(0xFF7480A8), fontFamily = FontFamily.Monospace)
        Card { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("CHAIN 3", style = MaterialTheme.typography.titleLarge, fontFamily = FontFamily.Monospace)
            Text(if (chain == true) "ENABLED" else if (chain == false) "DISABLED" else "UNKNOWN", color = if (chain == true) Color(0xFF4DFFB0) else Color(0xFFFF4D6D), fontFamily = FontFamily.Monospace)
            Button(enabled = bridge.state == ConnectionState.CONNECTED && chain != null, onClick = { val next = chain != true; bridge.exec("cmd connectivity set-chain3-enabled $next") { r -> output = r.stdout.ifBlank { r.stderr }; if (r.exitCode == 0) bridge.exec("cmd connectivity get-chain3-enabled") { check -> chain = check.stdout.trim().equals("true", true) } } }) { Text(if (chain == true) "DISABLE FIREWALL" else "ENABLE FIREWALL") }
        } }
        OutlinedButton(enabled = bridge.state == ConnectionState.CONNECTED, onClick = { bridge.exec("id") { r -> output = r.stdout.ifBlank { r.stderr } } }) { Text("TEST SHIZUKU: id") }
        Text("SERVICE: ${bridge.state}", fontFamily = FontFamily.Monospace, color = Color(0xFFE4E9F7))
        Text(output, fontFamily = FontFamily.Monospace, color = Color(0xFFE4E9F7))
    }
}

@Composable private fun VoidWallTheme(content: @Composable () -> Unit) { MaterialTheme(colorScheme = darkColorScheme(background = Color(0xFF05060A), surface = Color(0xFF0A0C14), primary = Color(0xFF00E5FF), secondary = Color(0xFFFF2BD6), error = Color(0xFFFF4D6D), onBackground = Color(0xFFE4E9F7), onSurface = Color(0xFFE4E9F7)), content = content) }
