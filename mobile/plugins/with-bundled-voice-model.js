// Expo config plugin: bundles the offline MMS voices (Filipino, Bisaya, English) inside the Android app.
// Copies only the voices listed below from native-assets/models/ into
// android/app/src/main/assets/models/ during `expo prebuild` (older voice folders there are left out),
// and builds only for real-phone CPUs (32- and 64-bit ARM) to keep the APK smaller.
// Voices are made with scripts/mms-export-onnx.py, then scripts/mms-shrink-weights.py; the app expects
// each folder to hold model.onnx (the shrunk file) and tokens.txt.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');

const voices = ['vits-mms-tgl', 'vits-mms-ceb', 'vits-mms-eng'];

function withBundledVoiceModel(config) {
  config = withDangerousMod(config, ['android', (modConfig) => {
    const sourceDirectory = path.join(modConfig.modRequest.projectRoot, 'native-assets', 'models');
    const targetDirectory = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'models');
    fs.rmSync(targetDirectory, { recursive: true, force: true });
    fs.mkdirSync(targetDirectory, { recursive: true });
    for (const voice of voices) {
      for (const file of ['model.onnx', 'tokens.txt']) {
        if (!fs.existsSync(path.join(sourceDirectory, voice, file))) {
          throw new Error(`Voice file ${voice}/${file} is missing. Make it with scripts/mms-export-onnx.py and scripts/mms-shrink-weights.py.`);
        }
      }
      fs.cpSync(path.join(sourceDirectory, voice), path.join(targetDirectory, voice), { recursive: true });
    }
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
