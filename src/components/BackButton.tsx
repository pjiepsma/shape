import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Button, useThemeColor } from 'heroui-native';

type Props = {
  className?: string;
  onPress?: () => void;
};

export function BackButton({ className = 'self-start', onPress }: Props) {
  const router = useRouter();
  const foreground = useThemeColor('foreground');

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`pl-0 pr-2 gap-1 ${className}`}
      accessibilityLabel="Back"
      onPress={onPress ?? (() => router.back())}
    >
      <SymbolView
        name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
        tintColor={foreground}
        size={16}
        style={{ marginLeft: -2 }}
      />
      <Button.Label>Back</Button.Label>
    </Button>
  );
}
