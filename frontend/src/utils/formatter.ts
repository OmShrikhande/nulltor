/**
 * In-browser code formatting engine for Nulltor Studio.
 * Formats JS, TS, JSON, CSS, HTML, Python, C, C++, Rust, and Go.
 */

export function formatCode(code: string, language: string): string {
  if (!code || typeof code !== 'string') return code;
  const lang = language.toLowerCase();

  if (lang === 'json') {
    try {
      const parsed = JSON.parse(code);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return code;
    }
  }

  // Multi-language indentation-based beautifier
  const lines = code.split('\n');
  const formatted: string[] = [];
  let indentLevel = 0;
  const indentStr = '  '; // 2 spaces

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Preserve blank lines
    if (!line) {
      formatted.push('');
      continue;
    }

    // Adjust indent for closing brackets / tags on current line
    if (line.startsWith('}') || line.startsWith(']') || line.startsWith(')') || line.startsWith('</')) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    // Apply current indentation
    if (lang === 'python') {
      // For python, preserve existing relative indentation structure but clean trailing whitespaces
      formatted.push(lines[i].trimEnd());
    } else {
      formatted.push(indentStr.repeat(indentLevel) + line);
    }

    // Count open vs close braces on this line to determine next line's indent
    if (lang !== 'python') {
      const openBraces = (line.match(/[{[(<]/g) || []).length;
      const closeBraces = (line.match(/[}\])>]/g) || []).length;

      // Handle simple C/JS block opens (e.g. if (...) { )
      const opens = (line.match(/{/g) || []).length + (line.match(/\(/g) || []).length;
      const closes = (line.match(/}/g) || []).length + (line.match(/\)/g) || []).length;
      
      if (line.endsWith('{') || line.endsWith('[') || line.endsWith('(')) {
        indentLevel++;
      } else if (openBraces > closeBraces && !line.startsWith('</')) {
        indentLevel = Math.max(0, indentLevel + (openBraces - closeBraces));
      }
    }
  }

  return formatted.join('\n');
}
