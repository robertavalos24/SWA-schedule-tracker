const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

code = code.replace(
  /let count = 0;\n\s*let amt = 0;/g,
  `let count = 0;\n  let amt = 0;\n  let dates: string[] = [];`
);

code = code.replace(
  /count \+= 1;\n\s*amt \+= defaultShiftRate;/g,
  `count += 1;\n          amt += defaultShiftRate;\n          dates.push(ds + " (1)");`
);

code = code.replace(
  /count \+= 0\.5;\n\s*amt \+= defaultShiftRate \/ 2;/g,
  `count += 0.5;\n          amt += defaultShiftRate / 2;\n          dates.push(ds + " (0.5)");`
);

code = code.replace(
  /return \{ count, amt \};/g,
  `return { count, amt, dates };`
);

fs.writeFileSync('src/utils/calculations.ts', code);
