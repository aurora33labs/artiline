/**
 * Forbid static imports from `lib/cloud/*` or `components/cloud/*` outside
 * those folders. Dynamic `import()` is allowed everywhere.
 *
 * Rationale: paid features must be tree-shakeable so the OSS bundle does not
 * ship cloud chunks. Dynamic-import-only enforces this at the dep-graph level.
 */
const CLOUD_PATTERNS = [
  /(?:^|\/)lib\/cloud\//,
  /(?:^|\/)components\/cloud\//,
  /^@\/lib\/cloud(\/|$)/,
  /^@\/components\/cloud(\/|$)/,
];

function isCloudSpecifier(specifier) {
  return CLOUD_PATTERNS.some((re) => re.test(specifier));
}

function isInCloudFolder(filename) {
  return /\/(lib|components)\/cloud\//.test(filename);
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow static imports from lib/cloud/* or components/cloud/* outside those folders. Use dynamic import() instead.",
    },
    schema: [],
    messages: {
      noStatic:
        "Static import from '{{specifier}}' is forbidden outside lib/cloud/* and components/cloud/*. Use dynamic `await import()` behind `isFeatureEnabled()`.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isInCloudFolder(filename)) return {};
    return {
      ImportDeclaration(node) {
        const specifier = node.source.value;
        if (isCloudSpecifier(specifier)) {
          context.report({ node, messageId: "noStatic", data: { specifier } });
        }
      },
    };
  },
};

export default rule;
