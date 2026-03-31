import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { CodeBlock } from './components/code-block';
import { Compare, CompareItem } from './components/compare';
import { KitcnLatestCommandTabs } from './components/kitcn-latest-command-tabs';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    pre: (props) => <CodeBlock {...props} />,
    Tab,
    Tabs,
    Compare,
    CompareItem,
    KitcnLatestCommandTabs,
    ...components,
  };
}
