const { withAppBuildGradle, withMainApplication } = require('@expo/config-plugins');

module.exports = function withAndroidNativeFixes(config) {
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('withShortCmakePath requires a Groovy app/build.gradle');
    if (!mod.modResults.contents.includes('buildStagingDirectory "C:/pfc"')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /android \{\r?\n/,
        `android {\n    externalNativeBuild {\n        cmake {\n            // Avoid Windows' 260-character generated CMake object paths.\n            if (System.getProperty("os.name").toLowerCase().contains("windows")) {\n                buildStagingDirectory "C:/pfc"\n            }\n        }\n    }\n`,
      );
    }
    return mod;
  });

  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('withShortCmakePath requires a Kotlin MainApplication');
    if (!mod.modResults.contents.includes('import ai.onnxruntime.reactnative.OnnxruntimePackage')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        'import android.content.res.Configuration',
        'import android.content.res.Configuration\n\nimport ai.onnxruntime.reactnative.OnnxruntimePackage',
      );
    }
    if (!mod.modResults.contents.includes('add(OnnxruntimePackage())')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        '// Packages that cannot be autolinked yet can be added manually here, for example:',
        '// ONNX Runtime is misclassified as an Expo unimodule and must be registered explicitly.\n          add(OnnxruntimePackage())',
      );
    }
    return mod;
  });
};
