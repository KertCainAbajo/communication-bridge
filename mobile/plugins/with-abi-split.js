// Expo config plugin: optionally build one smaller APK per phone processor type (ABI) instead
// of the single universal APK. Each split APK only carries the code for its own processor:
//   app-arm64-v8a-release.apk    newer phones (64-bit, most phones from about 2017 on)
//   app-armeabi-v7a-release.apk  older phones (32-bit)
// Off by default (the normal build is the universal APK that works on every phone).
// Turn it on for a build with the environment variable CB_SPLIT_APKS=1.
const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// communication-bridge abi split';

const splitBlock = `
    ${marker}
    splits {
        abi {
            enable System.getenv('CB_SPLIT_APKS') == '1'
            reset()
            include 'arm64-v8a', 'armeabi-v7a'
            universalApk false
        }
    }
`;

function withAbiSplit(config) {
  return withAppBuildGradle(config, (modConfig) => {
    let gradle = modConfig.modResults.contents;
    if (gradle.includes(marker)) return modConfig;
    gradle = gradle.replace(/android\s*\{/, (match) => `${match}${splitBlock}`);
    modConfig.modResults.contents = gradle;
    return modConfig;
  });
}

module.exports = withAbiSplit;
