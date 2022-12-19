const parse = require('pug-parser');
const lex = require('pug-lexer');
import { readFileSync } from 'fs';

const filename = 'target.pug';
console.log(transpile(readFileSync(filename).toString()));

interface BlockNode {
  type: 'Block';
  nodes: (TagNode | TextNode)[];
  line: number;
  filename: string;
}
interface TagNode {
  type: 'Tag';
  name: string;
  selfClosing: boolean;
  block: BlockNode;
  attrs: NodeAttr[];
  attributeBlocks: [];
  isInline: boolean;
  line: number;
  column: number;
  filename: string;
}
interface NodeAttr {
  name: string;
  val: string | boolean;
  line: number;
  column: number;
  filename: string;
  mustEscape: boolean;
}
interface TextNode {
  type: 'Text';
  val: string;
  line: number;
  column: number;
  filename: string;
}

function transpile(src: string): string {
  const tokens = lex(src, { filename });
  const ast: BlockNode = parse(tokens, { filename, src });
  console.log(JSON.stringify(ast, null, '  '));

  return compileBlockNode(ast);
}

function compileBlockNode(ast: BlockNode): string {
  let result = '';
  for (const node of ast.nodes) {
    if (node.type === 'Text') {
      result += compileTextNode(node);
    } else if (node.type === 'Tag') {
      result += compileTagNode(node);
    } else {
      throw new Error('unknown node type');
    }
  }
  return result;
}

function compileTagNode(node: TagNode): string {
  const vIf = node.attrs.find((x) => x.name === 'v-if');
  if (vIf) return compileVueDirective(node, vIf);

  const vFor = node.attrs.find((x) => x.name === 'v-for');
  if (vFor) return compileVueDirective(node, vFor);

  const m = node.name.match(/^v-/);
  const name = m
    ? node.name
        .split('-')
        .map((x) => capitalize(x))
        .join('')
    : node.name;
  let result = `<${name}`;
  if (node.attrs.length > 0) {
    result += ` ${compileTagAttrs(node.attrs)}`;
  }
  const vSlots = node.block.nodes.filter(isTagNode).filter((x) => x.attrs.some((y) => y.name.match(/^v-slot/)));
  if (vSlots.length > 0) {
    result += ' scopedSlots={{';
    for (const slotNode of vSlots) {
      result += compileVueDirective(slotNode, slotNode.attrs.find((x) => x.name.match(/^v-slot/))!);
    }
    result += '}}';
  }
  const children = node.block.nodes.filter((x) => !isTagNode(x) || !x.attrs.some((y) => y.name.match(/^v-slot/)));
  if (children.length > 0) {
    result += `>${compileBlockNode({ ...node.block, nodes: children })}</${name}>`;
  } else {
    result += ' />';
  }
  return result;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isTagNode(node: TagNode | TextNode | BlockNode): node is TagNode {
  return node.type === 'Tag';
}

function compileVueDirective(node: TagNode, dir: NodeAttr): string {
  if (dir.name.match(/^v\-slot:/)) {
    return compileVSlot(node, dir);
  } else if (dir.name === 'v-if') {
    return compileVIf(node, dir);
  } else if (dir.name === 'v-for') {
    return compileVFor(node, dir);
  } else {
    throw new Error(`unknown vue directive: ${dir.name}`);
  }
}

function compileVSlot(node: TagNode, dir: NodeAttr): string {
  const name = dir.name.slice(7);
  const args = typeof dir.val === 'string' ? dir.val.match(/^['"](.+)['"]$/)?.[1] || dir.val : '';

  const vFor = node.attrs.find((x) => x.name === 'v-for');
  if (vFor) {
    const { variable, iterable } = parseVFor(vFor);
    return `...(${iterable}.reduce((acc, ${variable}) => {acc${name} = (${args}) => (${compileTagNode({
      ...node,
      attrs: node.attrs.filter((x) => x.name !== dir.name && x.name !== 'v-for'),
    })}); return acc}, {})),`;
  } else {
    return `"${name}": (${args}) => (${compileTagNode({
      ...node,
      attrs: node.attrs.filter((x) => x.name !== dir.name),
    })}),`;
  }
}

function compileVIf(node: TagNode, dir: NodeAttr): string {
  const condition = parseVIf(dir);
  const body = compileTagNode({ ...node, attrs: node.attrs.filter((x) => x.name !== 'v-if') });
  return `{${condition} && ${body}}`;
}

function parseVIf(dir: NodeAttr): string {
  if (dir.val === true || dir.val === false) throw new Error(`invalid ${dir.name}`);

  const m = dir.val.match(/^['"](.+)['"]$/);
  return m && m[1] ? m[1] : dir.val;
}

function compileVFor(node: TagNode, dir: NodeAttr): string {
  const { variable, iterable } = parseVFor(dir);
  const body = compileTagNode({ ...node, attrs: node.attrs.filter((x) => x.name !== 'v-for') });
  return `{${iterable}.map((${variable}) => (${body}))}`;
}

function parseVFor(dir: NodeAttr): { variable: string; iterable: string } {
  if (dir.val === true || dir.val === false) throw new Error(`invalid ${dir.name}`);

  const m = dir.val.match(/^['"](.+)['"]$/);
  const val = m ? m[1] : dir.val;
  const n = val!.match(/^\((.+)\) in (.+)$/) || val!.match(/^(.+) in (.+)$/);
  if (!n || !n[1] || !n[2]) throw new Error(`invalid v-for: ${dir.val}`);

  return { variable: n[1], iterable: n[2] };
}

function compileTagAttrs(attrs: NodeAttr[]): string {
  const canBeMerged = (x: NodeAttr) => !isVueDirective(x) && typeof x.val !== 'boolean';
  const groups = groupBy(attrs, canBeMerged);
  const map = {
    canBeMergedAttrs: groups.find((x) => x[0])?.[1] || [],
    canNotBeMergedAttrs: groups.find((x) => !x[0])?.[1] || [],
  };
  const mergedAttrs = map.canBeMergedAttrs.reduce((acc, x) => {
    if (acc.has(x.name))
      acc.set(x.name, {
        ...acc.get(x.name)!,
        val: `${stripQuotes(acc.get(x.name)!.val as string)} ${stripQuotes(x.val as string)}`,
      });
    else acc.set(x.name, x);
    return acc;
  }, new Map<string, NodeAttr>());

  return [...map.canNotBeMergedAttrs, ...mergedAttrs.values()].map(compileTagAttr).join(' ');
}

function groupBy<K, V>(array: readonly V[], keyOf: (value: V) => K): [K, V[]][] {
  return Array.from(
    array.reduce((map, value) => {
      const key = keyOf(value);
      const values = map.get(key);
      if (values) values.push(value);
      else map.set(key, [value]);
      return map;
    }, new Map<K, V[]>())
  );
}

function isVueDirective(attr: NodeAttr): boolean {
  return attr.name.startsWith('v-') || attr.name.startsWith(':') || attr.name.startsWith('@');
}

function compileTagAttr(attr: NodeAttr): string {
  if (attr.val === true) {
    return attr.name;
  } else if (attr.val === false) {
    return `${attr.name}={false}`;
  }

  const val = stripQuotes(attr.val);
  if (attr.name === 'v-model') {
    return `value={${val}} oninput={(x) => ${val}.value = x }`;
  } else if (attr.name.charAt(0) === ':') {
    const name = attr.name.slice(1).replaceAll('.', '_TODO_');
    return `${name}={${val}}`;
  } else if (attr.name.charAt(0) === '@') {
    return `on${attr.name.slice(1)}={${val}}`;
  } else {
    return `${attr.name}="${val}"`;
  }
}

function compileTextNode(node: TextNode): string {
  const m = node.val.match(/^{{(.+)}}$/);
  return m ? `{${m[1]}}` : node.val;
}

function stripQuotes(str: string): string {
  return str.replace(/^['"](.+)['"]$/, '$1');
}

export {};
