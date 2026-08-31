import { spawnSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const JAVA_HOME = 'C:\\Program Files\\Microsoft\\jdk-21.0.12.101-hotspot';
const JAVA_EXE = path.join(JAVA_HOME, 'bin', 'java.exe');
const SDK_ROOT = 'C:\\Users\\ritik\\Android\\sdk';
const TOOLS_DIR = path.join(SDK_ROOT, 'cmdline-tools', 'latest');
const LIB_DIR = path.join(TOOLS_DIR, 'lib');

console.log('🚀 Starting Automated Android SDK & APK Build...');

function getAllJars(dir) {
  let jars = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      jars.push(...getAllJars(fullPath));
    } else if (entry.name.endsWith('.jar')) {
      jars.push(fullPath);
    }
  }
  return jars;
}

const allJars = getAllJars(LIB_DIR);
const classpath = allJars.join(';');
console.log(`📦 Loaded ${allJars.length} SDK Manager JAR dependencies.`);

// 1. Accept SDK Licenses
console.log('📝 Accepting Android SDK Licenses...');
const licenseProc = spawnSync(
  JAVA_EXE,
  [
    `-Dcom.android.sdklib.toolsdir=${TOOLS_DIR}`,
    '-classpath',
    classpath,
    'com.android.sdklib.tool.sdkmanager.SdkManagerCli',
    `--sdk_root=${SDK_ROOT}`,
    '--licenses',
  ],
  {
    input: 'y\ny\ny\ny\ny\ny\ny\ny\ny\ny\n',
    encoding: 'utf-8',
  }
);
console.log(licenseProc.stdout || '');
if (licenseProc.stderr) console.error(licenseProc.stderr);

// 2. Install Platforms and Build Tools
console.log('⬇️ Installing Android SDK Platform 35 & 34 and Build-Tools...');
const installProc = spawnSync(
  JAVA_EXE,
  [
    `-Dcom.android.sdklib.toolsdir=${TOOLS_DIR}`,
    '-classpath',
    classpath,
    'com.android.sdklib.tool.sdkmanager.SdkManagerCli',
    `--sdk_root=${SDK_ROOT}`,
    'platforms;android-35',
    'platforms;android-34',
    'build-tools;35.0.0',
    'build-tools;34.0.0',
    'platform-tools',
  ],
  {
    encoding: 'utf-8',
  }
);
console.log(installProc.stdout || '');
if (installProc.stderr) console.error(installProc.stderr);

// 3. Assemble Debug APK via Gradle
console.log('🔨 Compiling Android APK with Gradle (assembleDebug)...');
const gradleProc = spawnSync(
  'cmd.exe',
  ['/c', 'gradlew.bat assembleDebug'],
  {
    cwd: path.resolve('client', 'android'),
    env: {
      ...process.env,
      JAVA_HOME,
      ANDROID_HOME: SDK_ROOT,
      ANDROID_SDK_ROOT: SDK_ROOT,
    },
    encoding: 'utf-8',
  }
);
console.log(gradleProc.stdout || '');
if (gradleProc.stderr) console.error(gradleProc.stderr);

if (gradleProc.status === 0) {
  console.log('\n🎉 SUCCESS! Android APK has been built successfully!');
} else {
  console.error('\n❌ Gradle build exited with code:', gradleProc.status);
}
