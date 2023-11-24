const TerserPlugin = require('terser-webpack-plugin');

module.exports = [
  {
    mode: 'production',
    entry: './src/eth-provider-injected.js',
    output: {
      filename: 'eth-provider-injected.packed.js',
      path: `${__dirname}/dist`,
    },
  },
  {
    mode: 'production',
    entry: './src/renderer/control.jsx',
    output: {
      filename: 'control-compiled.js',
      path: `${__dirname}/src/renderer`,
    },
    target: 'electron-renderer',
    module: {
      rules: [
        {
          test: /\.?jsx$/,
          use: {
            loader: "babel-loader",
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react']
            }
          }
        },
      ]
    },
    optimization: {
      minimizer: [new TerserPlugin({
        extractComments: false,
      })],
    }
  }
];