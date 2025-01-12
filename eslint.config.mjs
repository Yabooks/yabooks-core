import globals from "globals";
import pluginJs from "@eslint/js";

/** @type { import('eslint').Linter.Config[] } */
export default [
    {
        files: [ "**/*.js" ],
        ignores: [ "gui/**/*.js" ],
        languageOptions: {
            sourceType: "commonjs",
            globals: globals.node
        }
    },
    {
        files: [ "gui/**/*.js" ],
        languageOptions: {
            globals: {
                ...globals.browser,
                axios: "readonly",
                Vue: "readonly"
            }
        },
        rules: {
            "no-undef": [ "warn" ]
        }
    },
    pluginJs.configs.recommended,
    {
        rules: {
            "no-empty": [ "warn" ],
            "no-useless-escape": [ "warn" ],
            "no-unused-vars": [ "warn", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" } ],
        }
    },
];