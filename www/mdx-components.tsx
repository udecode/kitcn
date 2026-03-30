import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { CodeBlock } from './components/code-block';
import { Compare, CompareItem } from './components/compare';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    pre: (props) => <CodeBlock {...props} />,
    Tab,
    Tabs,
    Compare,
    CompareItem,
    ...components,
  };
}
