// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'web-dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-irregular-whitespace': 'error',
      // The em-dash is banned project-wide (style rule of the author).
      'no-restricted-syntax': [
        'error',
        { selector: 'Literal[value=/\\u2014/]', message: 'Do not use the em-dash character.' },
        { selector: 'TemplateElement[value.raw=/\\u2014/]', message: 'Do not use the em-dash character.' },
      ],
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['web/public/**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: { ...globals.serviceworker },
    },
  },
);
