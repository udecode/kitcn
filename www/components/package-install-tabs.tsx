import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';

const packageManagers = ['npm', 'pnpm', 'yarn', 'bun'] as const;

type PackageManager = (typeof packageManagers)[number];

const installCommands: Record<PackageManager, string> = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  yarn: 'yarn add',
  bun: 'bun add',
};

export function PackageInstallTabs({
  packages,
  groupId = 'package-manager',
}: {
  packages: string;
  groupId?: string;
}) {
  return (
    <Tabs groupId={groupId} items={[...packageManagers]} persist>
      {packageManagers.map((pm) => (
        <Tab key={pm} value={pm}>
          <CodeBlock className="my-0">
            <Pre className="px-4">
              <code className={`language-bash package-manager-${pm}`}>
                {`${installCommands[pm]} ${packages}`}
              </code>
            </Pre>
          </CodeBlock>
        </Tab>
      ))}
    </Tabs>
  );
}
