const { JSDOM } = require('jsdom');

// Create a DOM with a paragraph
const dom = new JSDOM(`<p>Hello world</p>`);
const doc = dom.window.document;

const elements = Array.from(doc.querySelectorAll('p'));
console.log('Found elements:', elements.length);

elements.forEach(el => {
  const text = el.textContent?.trim() ?? '';
  console.log('Text:', JSON.stringify(text));
  console.log('Text length:', text.length);
  console.log('Words:', text.split(/\s+/));
  console.log('Word count:', text.split(/\s+/).length);
});
