/**
 * Validates each SKILL.md under skills/ against the contract the server itself
 * enforces, so a frontmatter typo fails loudly instead of making the agent
 * silently ignore the skill.
 *
 * Usage: node scripts/validate-skills.mjs [skills-dir]
 */

import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');

const skillsDir = path.resolve(repoRoot, process.argv[2] || 'skills');

// ---------------------------------------------------------------------------
// Minimal YAML frontmatter parser
// Handles only what SKILL.md actually uses:
//   - scalar string values:      key: value
//   - quoted scalars:            key: "value"
//   - block sequences:           key:\n  - item
//   - nested mappings:           key:\n  nested: value
// ---------------------------------------------------------------------------
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const yaml = match[1];
  const lines = yaml.split(/\r?\n/);
  const result = {};
  let i = 0;

  function readValueBlock(lines, startIndex, baseIndent) {
    const obj = {};
    const arr = [];
    let isArray = false;
    let i = startIndex;

    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') { i++; continue; }

      const indent = line.match(/^(\s*)/)[1].length;
      if (indent < baseIndent) break;

      const trimmed = line.trim();

      if (trimmed.startsWith('- ')) {
        isArray = true;
        arr.push(trimmed.slice(2).trim());
        i++;
        continue;
      }

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) { i++; continue; }

      const key = trimmed.slice(0, colonIdx).trim();
      const rest = trimmed.slice(colonIdx + 1).trim();

      if (rest === '') {
        const nextIndent = i + 1 < lines.length ? lines[i + 1].match(/^(\s*)/)[1].length : 0;
        if (nextIndent > indent) {
          const [nested, consumed] = readValueBlock(lines, i + 1, nextIndent);
          obj[key] = nested;
          i = consumed;
          continue;
        }
        obj[key] = '';
        i++;
        continue;
      }

      const stripped = rest.replace(/^["']|["']$/g, '');
      obj[key] = stripped;
      i++;
    }

    if (isArray) return [arr, i];
    return [obj, i];
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    const indent = line.match(/^(\s*)/)[1].length;
    if (indent !== 0) { i++; continue; }

    const trimmed = line.trim();
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) { i++; continue; }

    const key = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();

    if (rest === '') {
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextIndent = nextLine.match(/^(\s*)/)[1].length;
        if (nextIndent > 0) {
          const [nested, consumed] = readValueBlock(lines, i + 1, nextIndent);
          result[key] = nested;
          i = consumed;
          continue;
        }
      }
      result[key] = '';
      i++;
      continue;
    }

    result[key] = rest.replace(/^["']|["']$/g, '');
    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Validation logic
// ---------------------------------------------------------------------------

const problems = [];
const passes = [];

function fail(file, msg) {
  const line = `FAIL ${file}: ${msg}`;
  problems.push(line);
  console.log(line);
}

function pass(file, msg) {
  const line = `PASS ${file}: ${msg}`;
  passes.push(line);
  console.log(line);
}

async function validateSkill(dirName, skillFile) {
  const rel = path.relative(repoRoot, skillFile).replace(/\\/g, '/');

  // 1. File must exist on disk
  try {
    await access(skillFile);
  } catch {
    fail(rel, `file does not exist at expected path skills/${dirName}/SKILL.md`);
    return;
  }

  const text = await readFile(skillFile, 'utf8');

  // 2. Must have frontmatter delimiters
  if (!text.startsWith('---')) {
    fail(rel, 'missing YAML frontmatter opening delimiter (---) at start of file');
    return;
  }
  const fm = parseFrontmatter(text);
  if (!fm) {
    fail(rel, 'YAML frontmatter block not closed (missing closing ---)');
    return;
  }

  // 3. name must be present and non-empty
  if (!fm.name || fm.name.trim() === '') {
    fail(rel, 'frontmatter key "name" is missing or empty');
  } else {
    pass(rel, `name present: "${fm.name}"`);

    // 4. name must match directory name
    if (fm.name.trim() !== dirName) {
      fail(rel, `name "${fm.name}" does not match directory name "${dirName}" (server derives skill:// URI from the directory)`);
    } else {
      pass(rel, `name matches directory name "${dirName}"`);
    }
  }

  // 5. description must be present and non-empty
  if (!fm.description || fm.description.trim() === '') {
    fail(rel, 'frontmatter key "description" is missing or empty');
  } else {
    pass(rel, `description present (${fm.description.trim().length} chars)`);
  }

  // 6. allowed-tools must be present and a non-empty list
  const allowedTools = fm['allowed-tools'];
  if (!allowedTools) {
    fail(rel, 'frontmatter key "allowed-tools" is missing');
  } else if (!Array.isArray(allowedTools) || allowedTools.length === 0) {
    fail(rel, 'frontmatter key "allowed-tools" must be a non-empty list');
  } else {
    pass(rel, `allowed-tools lists ${allowedTools.length} tool(s)`);
  }

  // 7. metadata block must be present
  if (!fm.metadata || typeof fm.metadata !== 'object' || Array.isArray(fm.metadata)) {
    fail(rel, 'frontmatter key "metadata" is missing or not a mapping');
  } else {
    pass(rel, 'metadata block present');

    // 8. metadata.mcp-server must be present and non-empty
    const mcpServer = fm.metadata['mcp-server'];
    if (!mcpServer || mcpServer.trim() === '') {
      fail(rel, 'frontmatter key "metadata.mcp-server" is missing or empty (server registers skill:// under this name)');
    } else {
      pass(rel, `metadata.mcp-server: "${mcpServer}"`);
    }

    // 9. metadata.mcp-protocol must be present
    const mcpProtocol = fm.metadata['mcp-protocol'];
    if (!mcpProtocol || mcpProtocol.trim() === '') {
      fail(rel, 'frontmatter key "metadata.mcp-protocol" is missing or empty');
    } else {
      pass(rel, `metadata.mcp-protocol: "${mcpProtocol}"`);
    }
  }
}

async function main() {
  let dirs;
  try {
    dirs = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    console.error(`ERROR: cannot read skills directory: ${skillsDir}`);
    process.exit(1);
  }

  const skillDirs = dirs.filter((d) => d.isDirectory()).map((d) => d.name);

  if (skillDirs.length === 0) {
    console.log(`No skill directories found in ${skillsDir}`);
    process.exit(1);
  }

  for (const dirName of skillDirs) {
    const skillFile = path.join(skillsDir, dirName, 'SKILL.md');
    await validateSkill(dirName, skillFile);
  }

  console.log('');
  console.log(`${passes.length} check(s) passed, ${problems.length} problem(s) found`);
  process.exit(problems.length > 0 ? 1 : 0);
}

main();
