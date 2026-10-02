plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

val releaseKeystorePath = System.getenv("PULSE_KEYSTORE_PATH")?.takeIf { it.isNotBlank() && file(it).exists() }

android {
    namespace = "io.github.kreza6173pixel.voidwall"
    compileSdk = 36
    defaultConfig {
        applicationId = "io.github.kreza6173pixel.voidwall"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }
    signingConfigs {
        if (releaseKeystorePath != null) create("release") {
            storeFile = file(releaseKeystorePath)
            storePassword = System.getenv("PULSE_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("PULSE_KEY_ALIAS")
            keyPassword = System.getenv("PULSE_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            if (releaseKeystorePath != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    buildFeatures { compose = true; aidl = true }
    dependenciesInfo { includeInApk = false; includeInBundle = false }
    packaging { resources.excludes += "META-INF/{AL2.0,LGPL2.1,LGPL2.1_}" }
    lint { abortOnError = false; checkReleaseBuilds = false }
}

dependencies {
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.material3)
    implementation(libs.shizuku.api)
    implementation(libs.shizuku.provider)
    testImplementation("junit:junit:4.13.2")
}
