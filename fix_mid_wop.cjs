const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

const regex = /      if \(midHrs > 0\) \{\s*const effectiveMidHrs = Math\.max\(0, midHrs - wopHrs\);\s*if \(effectiveMidHrs > 4\) \{\s*count \+= 1;\s*amt \+= defaultShiftRate;\s*dates\.push\(ds \+ " \(1\)"\);\s*\} else if \(effectiveMidHrs > 0\) \{\s*count \+= 0\.5;\s*amt \+= defaultShiftRate \/ 2;\s*dates\.push\(ds \+ " \(0\.5\)"\);\s*\}\s*\}/g;

const repl = `      if (midHrs > 0) {
        const workedMidHrs = Math.max(0, midHrs - wopHrs);
        if (workedMidHrs > 0) {
          if (midHrs > 4) {
            count += 1;
            amt += defaultShiftRate;
            dates.push(ds + " (1)");
          } else {
            count += 0.5;
            amt += defaultShiftRate / 2;
            dates.push(ds + " (0.5)");
          }
        }
      }`;

code = code.replace(regex, repl);
fs.writeFileSync('src/utils/calculations.ts', code);
