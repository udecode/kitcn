import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { CodeBlock } from '@/components/code-block';
import { getLatestKitcnCommands, packageManagers } from '@/lib/kitcn-commands';

export function KitcnLatestCommandTabs({
  commands,
  groupId = 'package-manager',
}: {
  commands: string | string[];
  groupId?: string;
}) {
  const latestCommands = getLatestKitcnCommands(commands);

  return (
    <Tabs groupId={groupId} items={[...packageManagers]} persist>
      {packageManagers.map((packageManager) => (
        <Tab key={packageManager} value={packageManager}>
          <CodeBlock className="my-0">
            <code className={`language-bash package-manager-${packageManager}`}>
              {latestCommands[packageManager]}
            </code>
          </CodeBlock>
        </Tab>
      ))}
    </Tabs>
  );
}
