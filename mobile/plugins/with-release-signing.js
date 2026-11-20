// Expo config plugin: sign release builds with the app's own key instead of the shared debug key.
// The key and its passwords never live in this project. Point CB_SIGNING_PROPERTIES at a
// properties file (storeFile, storePassword, keyAlias, keyPassword); without it, release builds
// fall back to the debug key so local test builds still work.
const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// communication-bridge release signing';

const signingBlock = `
    ${marker}
    def cbSigningPath = System.getenv('CB_SIGNING_PROPERTIES')
    def cbSigningFile = cbSigningPath ? file(cbSigningPath) : null
    def cbSigning = new Properties()
    if (cbSigningFile != null && cbSigningFile.exists()) {
        cbSigningFile.withInputStream { cbSigning.load(it) }
    }
`;

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    let gradle = modConfig.modResults.contents;
    if (gradle.includes(marker)) return modConfig;

    // Read the properties at the start of the android block.
    gradle = gradle.replace(/android\s*\{/, (match) => `${match}${signingBlock}`);

    // Add a release signing config next to the debug one.
    gradle = gradle.replace(/signingConfigs\s*\{/, (match) => `${match}
        release {
            if (cbSigning['storeFile']) {
                storeFile file(cbSigning['storeFile'])
                storePassword cbSigning['storePassword']
                keyAlias cbSigning['keyAlias']
                keyPassword cbSigning['keyPassword']
            }
        }`);

    // Use it for release builds when the key is available.
    const releaseType = gradle.indexOf('release {', gradle.indexOf('buildTypes'));
    if (releaseType < 0) throw new Error('with-release-signing: release build type not found');
    const before = gradle.slice(0, releaseType);
    const after = gradle.slice(releaseType).replace(
      'signingConfig signingConfigs.debug',
      "signingConfig cbSigning['storeFile'] ? signingConfigs.release : signingConfigs.debug",
    );
    modConfig.modResults.contents = before + after;
    return modConfig;
  });
}

module.exports = withReleaseSigning;
