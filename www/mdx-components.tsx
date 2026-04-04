import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Compare, CompareItem } from './components/compare';
import { KitcnLatestCommandTabs } from './components/kitcn-latest-command-tabs';
import { PackageInstallTabs } from './components/package-install-tabs';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Tab,
    Tabs,
    Compare,
    CompareItem,
    KitcnLatestCommandTabs,
    PackageInstallTabs,
    ...components,
  };
}
