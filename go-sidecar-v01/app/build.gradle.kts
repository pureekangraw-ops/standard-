plugins {
    id("com.android.application")
}

android {
    namespace = "com.big.go.sidecar"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.big.go.sidecar.dev"
        minSdk = 29
        targetSdk = 36
        versionCode = 2
        versionName = "0.1.1-dev"

        testInstrumentationRunner = "android.test.InstrumentationTestRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
