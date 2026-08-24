// Language detection, badge metadata and a dependency-free syntax highlighter.
// Extracted from CodeEditor so component files only export components.

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", mts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "json",
  css: "css", scss: "css", less: "css",
  html: "html", htm: "html", xml: "html", svg: "html",
  py: "python", pyw: "python",
  rs: "rust",
  md: "markdown", markdown: "markdown",
  toml: "toml",
  yaml: "yaml", yml: "yaml",
  sh: "shell", bash: "shell", zsh: "shell",
  sql: "sql", go: "go", java: "java",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
  cs: "csharp", rb: "ruby", php: "php", swift: "swift", kt: "kotlin",
};

export function langOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "text";
}

export const LANG_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  typescript: { label: "TS", bg: "#3178c6", fg: "#ffffff" },
  javascript: { label: "JS", bg: "#f7df1e", fg: "#111111" },
  json: { label: "{ }", bg: "#8a8a8a", fg: "#ffffff" },
  css: { label: "CS", bg: "#663399", fg: "#ffffff" },
  html: { label: "<>", bg: "#e34f26", fg: "#ffffff" },
  python: { label: "PY", bg: "#3776ab", fg: "#ffffff" },
  rust: { label: "RS", bg: "#ce422b", fg: "#ffffff" },
  markdown: { label: "MD", bg: "#519aba", fg: "#ffffff" },
  yaml: { label: "YA", bg: "#cb171e", fg: "#ffffff" },
  toml: { label: "TM", bg: "#9c4221", fg: "#ffffff" },
  shell: { label: "$", bg: "#89e051", fg: "#111111" },
  sql: { label: "SQ", bg: "#dd6b20", fg: "#ffffff" },
  go: { label: "GO", bg: "#00add8", fg: "#111111" },
  java: { label: "JV", bg: "#b07219", fg: "#ffffff" },
  c: { label: "C", bg: "#555555", fg: "#ffffff" },
  cpp: { label: "C+", bg: "#f34b7d", fg: "#ffffff" },
  csharp: { label: "C#", bg: "#178600", fg: "#ffffff" },
  ruby: { label: "RB", bg: "#cc342d", fg: "#ffffff" },
  php: { label: "PH", bg: "#4f5d95", fg: "#ffffff" },
  swift: { label: "SW", bg: "#f05138", fg: "#ffffff" },
  kotlin: { label: "KT", bg: "#a97bff", fg: "#111111" },
  text: { label: "T", bg: "#52525b", fg: "#ffffff" },
};

const LF = String.fromCharCode(10);
const BS_CH = String.fromCharCode(92);
const TAB = String.fromCharCode(9);

const KEYWORDS: Record<string, Set<string>> = {
  typescript: new Set(
    ("abstract any as async await boolean break case catch class const continue debugger declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let namespace never new null number object of package private protected public readonly return satisfies set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield").split(" ")
  ),
  javascript: new Set(
    ("async await break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null of return super switch this throw true try typeof undefined var void while with yield").split(" ")
  ),
  python: new Set(
    ("and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield match case self print").split(" ")
  ),
  rust: new Set(
    ("as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while").split(" ")
  ),
  json: new Set(["true", "false", "null"]),
  go: new Set(
    ("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false").split(" ")
  ),
  java: new Set(
    ("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws transient try void volatile while true false null").split(" ")
  ),
  c: new Set(
    ("auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while NULL true false").split(" ")
  ),
  cpp: new Set(
    ("auto break case catch char class const constexpr continue default delete do double else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while").split(" ")
  ),
  csharp: new Set(
    ("abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach get goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed set short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while").split(" ")
  ),
  ruby: new Set(
    ("alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield").split(" ")
  ),
  php: new Set(
    ("abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list namespace new or print private protected public require require_once return static switch throw trait try unset use var while xor yield true false null").split(" ")
  ),
  swift: new Set(
    ("associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as Any catch false is nil super self throw throws true try").split(" ")
  ),
  kotlin: new Set(
    ("as break by class continue do else false for fun if in interface is null object package return super this throw true try typealias val var when while").split(" ")
  ),
  sql: new Set(
    ("SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE DROP ALTER ADD PRIMARY KEY FOREIGN REFERENCES JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT OFFSET AS AND OR NOT NULL DISTINCT COUNT SUM AVG MIN MAX UNION ALL EXISTS BETWEEN LIKE IN IS").split(" ")
  ),
};

const HASH_COMMENTS = new Set(["python", "shell", "yaml", "toml", "ruby"]);

/** Line-comment token for a language, or null when unsupported. */
export function commentToken(lang: string): string | null {
  if (HASH_COMMENTS.has(lang)) return "#";
  if (["typescript", "javascript", "rust", "go", "java", "c", "cpp", "csharp",
    "php", "swift", "kotlin"].includes(lang)) return "//";
  if (lang === "sql") return "--";
  return null;
}

// Entities are built via concatenation so the source never contains a bare
// entity reference (which would be collapsed by tooling).
const E_AMP = "&" + "amp;";
const E_LT = "&" + "lt;";
const E_GT = "&" + "gt;";

function escapeHtml(s: string): string {
  let out = "";
  for (const ch of s) {
    if (ch === "&") out += E_AMP;
    else if (ch === "<") out += E_LT;
    else if (ch === ">") out += E_GT;
    else out += ch;
  }
  return out;
}

function isWordStart(c: string): boolean {
  return (
    (c >= "a" && c <= "z") ||
    (c >= "A" && c <= "Z") ||
    c === "_" ||
    c === "$"
  );
}

function isWordChar(c: string): boolean {
  return isWordStart(c) || (c >= "0" && c <= "9");
}

const COLORS = {
  kw: "#c678dd",
  str: "#98c379",
  num: "#d19a66",
  com: "#7f848e",
  fn: "#61afef",
  tag: "#e06c75",
};

/**
 * Hand-rolled tokenizer: comments, strings, numbers, keywords and function
 * calls. Batched plain-text runs keep it fast even for large files.
 */
export function highlightCode(code: string, lang: string): string {
  const kw = KEYWORDS[lang];
  const hashCom = HASH_COMMENTS.has(lang);
  const isMarkup = lang === "html" || lang === "xml";
  const isMd = lang === "markdown";

  let out = "";
  let buf = "";
  let i = 0;
  const n = code.length;

  const flush = () => {
    if (buf) {
      out += escapeHtml(buf);
      buf = "";
    }
  };
  const push = (color: string, text: string, italic = false) => {
    flush();
    out += `<span style="color:${color};${italic ? "font-style:italic;" : ""}">${escapeHtml(text)}</span>`;
  };

  while (i < n) {
    const c = code[i];
    const two = i + 1 < n ? c + code[i + 1] : c;

    // Markdown headings: color the whole line.
    if (isMd && c === "#" && (i === 0 || code[i - 1] === LF)) {
      let j = code.indexOf(LF, i);
      if (j === -1) j = n;
      push(COLORS.kw, code.slice(i, j));
      i = j;
      continue;
    }

    // Block comments: /* */ and <!-- -->.
    if (two === "/*" || (isMarkup && code.slice(i, i + 4) === "<!--")) {
      const end = two === "/*" ? "*/" : "-->";
      let j = code.indexOf(end, i + 2);
      j = j === -1 ? n : j + end.length;
      push(COLORS.com, code.slice(i, j), true);
      i = j;
      continue;
    }

    // Line comments: // or # (language-dependent).
    if (two === "//" || (hashCom && c === "#")) {
      let j = code.indexOf(LF, i);
      if (j === -1) j = n;
      push(COLORS.com, code.slice(i, j), true);
      i = j;
      continue;
    }

    // Strings: ' " `
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (code[j] === BS_CH && j + 1 < n) {
          j += 2;
          continue;
        }
        if (code[j] === c || code[j] === LF) {
          j++;
          break;
        }
        j++;
      }
      push(COLORS.str, code.slice(i, j));
      i = j;
      continue;
    }

    // Markup tag names: <word
    if (isMarkup && c === "<" && i + 1 < n && isWordStart(code[i + 1])) {
      let j = i + 1;
      while (j < n && isWordChar(code[j])) j++;
      push(COLORS.tag, code.slice(i, j));
      i = j;
      continue;
    }

    // Numbers.
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < n && ((code[j] >= "0" && code[j] <= "9") || code[j] === ".")) j++;
      push(COLORS.num, code.slice(i, j));
      i = j;
      continue;
    }

    // Identifiers / keywords / function calls.
    if (isWordStart(c)) {
      let j = i;
      while (j < n && isWordChar(code[j])) j++;
      const word = code.slice(i, j);
      let k = j;
      while (k < n && (code[k] === " " || code[k] === TAB)) k++;
      if (kw?.has(word)) push(COLORS.kw, word);
      else if (code[k] === "(") push(COLORS.fn, word);
      else buf += word;
      i = j;
      continue;
    }

    buf += c;
    i++;
  }
  flush();
  return out;
}

/* ---------------------------------------------------------------------------
 * Editor
 * ------------------------------------------------------------------------- */
