import { LanguageSwitcher } from '@/components/language-switcher';
import { setAutoJoinLastChannel } from '@/features/app/actions';
import { useAutoJoinLastChannel } from '@/features/app/hooks';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Group,
  Switch
} from '@sharkord/ui';
import { Monitor } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

const isElectron = window.desktop?.isElectron === true;
const desktopAppVersion = window.desktop?.appVersion;

const Others = memo(() => {
  const { t } = useTranslation('settings');
  const autoJoinLastChannel = useAutoJoinLastChannel();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('othersTitle')}</CardTitle>
        <CardDescription>{t('othersDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isElectron && (
          <Group
            label={t('desktopAppVersionLabel')}
            description={t('desktopAppVersionDesc')}
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Monitor className="h-4 w-4 shrink-0" />
              <span className="font-mono">
                {desktopAppVersion
                  ? `v${desktopAppVersion}`
                  : t('unknownVersion')}
              </span>
            </div>
          </Group>
        )}

        <Group
          label={t('autoJoinLastChannelLabel')}
          description={t('autoJoinLastChannelDesc')}
        >
          <Switch
            checked={autoJoinLastChannel}
            onCheckedChange={(value) => setAutoJoinLastChannel(value)}
          />
        </Group>

        <Group label={t('languageLabel')} description={t('languageDesc')}>
          <LanguageSwitcher />
        </Group>
      </CardContent>
    </Card>
  );
});

export { Others };
