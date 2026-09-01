const fs = require('fs');
let code = fs.readFileSync('src/components/Modals.tsx', 'utf8');

if (!code.includes('showMidDates')) {
  code = code.replace(
    /const \[subView, setSubView\] = useState<string>\('MAIN'\);/,
    `const [subView, setSubView] = useState<string>('MAIN');\n  const [showMidDates, setShowMidDates] = useState(false);`
  );
  fs.writeFileSync('src/components/Modals.tsx', code);
}
