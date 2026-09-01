with open("src/utils/calculations.ts", "r") as f:
    text = f.read()

text = text.replace(
"""        dates.push(ds + " (0.5)");
      }
    }""", 
"""        dates.push(ds + " (0.5)");
      }
      }
    }"""
)

with open("src/utils/calculations.ts", "w") as f:
    f.write(text)
