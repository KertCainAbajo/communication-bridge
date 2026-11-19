// Expo config plugin: keep rules for the release build's code shrinker (R8).
// Without them the release app crashes on start (WorkManager's database class is removed) and the
// offline voice can break (its native code looks up Java classes by their original names).
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const marker = '# communication-bridge keep rules';
const rules = `
${marker}
# WorkManager (used by a library) creates its Room database by class name.
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keep class * extends androidx.room.RoomDatabase { <init>(); }
# Offline voice engine: JNI code finds these classes and fields by name.
-keep class com.k2fsa.sherpa.onnx.** { *; }
-keep class com.sherpaonnx.** { *; }
# On-device translator (local Expo module and Google ML Kit).
-keep class expo.modules.offlinetranslator.** { *; }
-keep class com.google.mlkit.** { *; }
`;

function withReleaseKeepRules(config) {
  return withDangerousMod(config, ['android', (modConfig) => {
    const file = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (!current.includes(marker)) fs.writeFileSync(file, `${current.trimEnd()}\n${rules}`);
    return modConfig;
  }]);
}

module.exports = withReleaseKeepRules;
