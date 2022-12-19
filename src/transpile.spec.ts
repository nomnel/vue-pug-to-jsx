import { transpile } from './transpile';

describe('transpile', () => {
  it('transpile to a self-closing tag if child nodes do not exist.', () => {
    const src = `
tag
`;
    expect(transpile(src)).toBe('<tag />');
  });

  it('handles variable interpolation', () => {
    const src = `
tag
  | {{ var }}
`;
    expect(transpile(src)).toBe('<tag>{ var }</tag>');
  });

  it('handle nested tags', () => {
    const src = `
tag1
  tag2
    tag3
      | text
`;
    expect(transpile(src)).toBe('<tag1><tag2><tag3>text</tag3></tag2></tag1>');
  });

  it('handle tag attributes', () => {
    const src = `
tag(attr1="value1_1 value1_2" attr2="value2")
  | text
`;
    expect(transpile(src)).toBe('<tag attr1="value1_1 value1_2" attr2="value2">text</tag>');
  });

  it('handle boolean attribute', () => {
    const src = `
tag(attr)
  | text
`;
    expect(transpile(src)).toBe('<tag attr>text</tag>');
  });

  it('merges class names', () => {
    const src = `
tag.class1(class="class2")
  | text
`;
    expect(transpile(src)).toBe('<tag class="class1 class2">text</tag>');
  });

  it('translates to CamelCase tag name from kebab-case tag name (only if tag name includes hyphen)', () => {
    const src = `
some-tag
  | text
`;
    expect(transpile(src)).toBe('<SomeTag>text</SomeTag>');
  });

  it('handles v-if', () => {
    const src = `
tag(v-if="condition")
  | text
`;
    expect(transpile(src)).toBe('{condition && <tag>text</tag>}');
  });

  // TODO
  xit('handles a combination of v-if and v-else', () => {
    const src = `
tag1
  tag2(v-if="condition")
    | text2
  tag3(v-else)
    | text3
`;
    expect(transpile(src)).toBe('<tag1>{condition ? <tag2>text2</tag2> : <tag3>text3</tag3>}</tag1>');
  });

  it('handles v-for', () => {
    const src = `
tag(v-for="item in items")
  | {{ item.name }}
`;
    expect(transpile(src)).toBe('{items.map((item) => (<tag>{ item.name }</tag>))}');
  });

  it('handles a combination of v-for and v-if', () => {
    const src = `
tag(v-for="item in items" v-if="condition")
  | {{ item.name }}
`;
    // TODO
    // expect(transpile(src)).toBe('{condition && items.map((item) => (<tag>{ item.name }</tag>))}');
    expect(transpile(src)).toBe('{condition && {items.map((item) => (<tag>{ item.name }</tag>))}}');
  });

  it('handles `:`(v-bind)', () => {
    const src = `
tag(:attr="value")
  | text
`;
    expect(transpile(src)).toBe('<tag attr={value}>text</tag>');
  });

  xit('handles v-bind', () => {
    const src = `
tag(v-bind:attr="value")
  | text
`;
    expect(transpile(src)).toBe('<tag attr={value}>text</tag>');
  });

  it('handles a combination of v-for and v-bind', () => {
    const src = `
tag(v-for="item in items" :attr="item")
  | text
`;
    expect(transpile(src)).toBe('{items.map((item) => (<tag attr={item}>text</tag>))}');
  });

  it('handles v-model', () => {
    const src = `
tag(v-model="item")
  | text
`;
    expect(transpile(src)).toBe('<tag value={item} oninput={(x) => item.value = x }>text</tag>');
  });

  it('handles `@`(v-on)', () => {
    const src = `
tag(@click="fn")
  | text
`;
    expect(transpile(src)).toBe('<tag onclick={fn}>text</tag>');
  });

  it('handles v-slot', () => {
    const src = `
tag
  template(v-slot:slot1)
    | slot1 text
  | text
`;
    expect(transpile(src)).toBe('<tag scopedSlots={{"slot1": () => (<template>slot1 text</template>),}}>text</tag>');
  });

  it('handles v-slots', () => {
    const src = `
tag
  template(v-slot:slot1)
    | slot1 text
  template(v-slot:slot2)
    | slot2 text
  | text
`;
    expect(transpile(src)).toBe(
      '<tag scopedSlots={{"slot1": () => (<template>slot1 text</template>),"slot2": () => (<template>slot2 text</template>),}}>text</tag>'
    );
  });

  it('handles v-slot that name includes some dots', () => {
    const src = `
tag
  template(v-slot:slot1.field)
    | slot text
  | text
`;
    expect(transpile(src)).toBe(
      '<tag scopedSlots={{"slot1.field": () => (<template>slot text</template>),}}>text</tag>'
    );
  });

  it('handles v-slot with slot props', () => {
    const src = `
tag
  template(v-slot:slot1='slotProps')
    | slot1 text
  | text
`;
    expect(transpile(src)).toBe(
      '<tag scopedSlots={{"slot1": (slotProps) => (<template>slot1 text</template>),}}>text</tag>'
    );
  });

  it('handles a combination of v-for and v-slot', () => {
    const src = `
tag
  template(v-for='item in items', v-slot:[\`item.\${item.name}\`]='{ item }')
    | {{ item.name }}
  | text
`;
    expect(transpile(src)).toBe(
      '<tag scopedSlots={{...(items.reduce((acc, item) => {acc[`item.${item.name}`] = ({ item }) => (<template>{ item.name }</template>); return acc}, {})),}}>text</tag>'
    );
  });
});
