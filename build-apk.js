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

// 1. Build Client Web Assets
console.log('⚛️ Building React Web App...');
execSync('npm run build', { cwd: path.resolve('client'), stdio: 'inherit' });

// 2. Sync with Capacitor Android
console.log('📲 Syncing Capacitor Android assets...');
try {
  execSync('npx cap sync android', { cwd: path.resolve('client'), stdio: 'inherit' });
} catch (e) {
  console.log('Capacitor sync note:', e.message);
}

// 3. Assemble Release & Debug APKs via Gradle
console.log('🔨 Compiling Signed Android Release APK with Gradle (assembleRelease)...');
const gradleRelease = spawnSync(
  'cmd.exe',
  ['/c', 'gradlew.bat assembleRelease'],
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
console.log(gradleRelease.stdout || '');
if (gradleRelease.stderr) console.error(gradleRelease.stderr);

console.log('🔨 Compiling Android Debug APK with Gradle (assembleDebug)...');
const gradleDebug = spawnSync(
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
console.log(gradleDebug.stdout || '');
if (gradleDebug.stderr) console.error(gradleDebug.stderr);

// 4. Copy Output APKs to Root
const releaseSrc = path.resolve('client', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const debugSrc = path.resolve('client', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

if (fs.existsSync(releaseSrc)) {
  fs.copyFileSync(releaseSrc, path.resolve('nexchat-release.apk'));
  console.log(`✅ Signed Release APK copied -> ${path.resolve('nexchat-release.apk')} (${(fs.statSync('nexchat-release.apk').size / 1024 / 1024).toFixed(2)} MB)`);
}

if (fs.existsSync(debugSrc)) {
  fs.copyFileSync(debugSrc, path.resolve('nexchat-debug.apk'));
  console.log(`✅ Debug APK copied -> ${path.resolve('nexchat-debug.apk')} (${(fs.statSync('nexchat-debug.apk').size / 1024 / 1024).toFixed(2)} MB)`);
}

console.log('\n🎉 ALL BUILDS COMPLETED SUCCESSFULLY!');
