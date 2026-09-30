import { BuddyAvatar } from '@/components/buddy/BuddyAvatar';
import { Button, type ButtonProps } from '@/components/common/ui';
import { useSettings } from '@/settings/settings';

// "问搭子" with the buddy's face from settings in place of an icon
export function AskBuddyButton({ label = '问搭子', ...props }: Omit<ButtonProps, 'icon' | 'leading' | 'label'> & { label?: string }) {
  const { buddyAvatar } = useSettings();
  return <Button {...props} label={label} leading={<BuddyAvatar value={buddyAvatar} size={props.compact ? 20 : 26} />} />;
}
