import { Alert, Platform } from 'react-native';

type ConfirmAlertOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

function formatWebMessage(title: string, message?: string) {
  return message ? `${title}\n\n${message}` : title;
}

export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(formatWebMessage(title, message));
    return;
  }

  Alert.alert(title, message);
}

export function confirmAlert({
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  destructive = false,
}: ConfirmAlertOptions) {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(formatWebMessage(title, message)) ?? false);
  }

  return new Promise<boolean>(resolve => {
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    Alert.alert(
      title,
      message,
      [
        {
          text: cancelText,
          style: 'cancel',
          onPress: () => finish(false),
        },
        {
          text: confirmText,
          style: destructive ? 'destructive' : 'default',
          onPress: () => finish(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => finish(false),
      }
    );
  });
}
