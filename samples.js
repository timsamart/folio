import welcome from "./welcome.md?raw";
import systems from "./systems.md?raw";
import async from "./async.md?raw";
export const samples = [
  {
    id: 'welcome', title: 'A quieter way to read', name: 'a-quieter-way-to-read.md', collection: 'The reading room',
    content: welcome
  },
  {
    id: 'systems', title: 'Thinking in systems', name: 'thinking-in-systems.md', collection: 'Field notes',
    content: systems
  },
  {
    id: 'async', title: 'The art of waiting', name: 'the-art-of-waiting.md', collection: 'Code & craft',
    content: async
  },
];
