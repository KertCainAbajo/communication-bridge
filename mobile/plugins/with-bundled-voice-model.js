// Expo config plugin: bundles the offline voice (used for Filipino and Bisaya) inside the Android app.
// Copies native-assets/models/* into android/app/src/main/assets/models/ during `expo prebuild`,
// and builds only for real-phone CPUs (32- and 64-bit ARM) to keep the APK smaller.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');

function withBundledVoiceModel(config) {
  config = withDangerousMod(config, ['android', (modConfig) => {
    const sourceDirectory = path.join(modConfig.modRequest.projectRoot, 'native-assets', 'models');
    for (const voice of ['vits-piper-fil-v2']) {
      if (!fs.existsSync(path.join(sourceDirectory, voice, 'model.onnx'))) {
        throw new Error(`Voice model ${voice} is missing. Run \`python scripts/prepare-voice-model.py\` in mobile/ first.`);
      }
    }
    const targetDirectory = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'models');
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.cpSync(sourceDirectory, targetDirectory, { recursive: true });
    return modConfig;
  }]);

  return withGradleProperties(config, (modConfig) => {
    const key = 'reactNativeArchitectures';
    modConfig.modResults = modConfig.modResults.filter((item) => !(item.type === 'property' && item.key === key));
    modConfig.modResults.push({ type: 'property', key, value: 'armeabi-v7a,arm64-v8a' });
    return modConfig;
  });
}

module.exports = withBundledVoiceModel;
