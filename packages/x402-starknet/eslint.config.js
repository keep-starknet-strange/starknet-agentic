import js from "@eslint/js"

export default [
<<<<<<< HEAD
=======
  { ignores: ["dist/**"] },
>>>>>>> origin/main
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {
      "no-unused-vars": "off"
    }
  }
]
