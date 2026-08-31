import { type SignUpInput, signUpSchema } from '@cal/schemas';
import { Button, Screen, Text, TextField, useTheme } from '@cal/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { toAppError } from '../../../lib/errors/app-error';
import { AppleSignInButton } from '../components/AppleSignInButton';
import { AuthDivider } from '../components/AuthDivider';
import { useAuthActions } from '../hooks/useAuthActions';

export function SignUpScreen() {
  const theme = useTheme();
  const { signUp, apple } = useAuthActions();

  const { control, handleSubmit } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  });

  const submitError = signUp.error ? toAppError(signUp.error) : null;

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ gap: theme.spacing.xxl }}
      >
        <View style={{ gap: theme.spacing.xs, paddingTop: theme.spacing.xxl }}>
          <Text variant="display">Create your account</Text>
          <Text variant="callout" color="secondary">
            Your calendar and your to-do list, finally in the same place.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.lg }}>
          <Controller
            control={control}
            name="fullName"
            render={({ field, fieldState }) => (
              <TextField
                label="Name"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                autoComplete="name"
                textContentType="name"
                placeholder="Alex Rivera"
              />
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field, fieldState }) => (
              <TextField
                label="Email"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <TextField
                label="Password"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                hint="At least 8 characters."
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="••••••••"
              />
            )}
          />

          {submitError ? (
            <Text variant="footnote" color="danger">
              {submitError.message}
            </Text>
          ) : null}

          <Button
            label="Create account"
            fullWidth
            loading={signUp.isPending}
            onPress={handleSubmit((values) => signUp.mutate(values))}
          />
        </View>

        <AuthDivider />

        <AppleSignInButton onPress={() => apple.mutate()} disabled={apple.isPending} />

        <View style={{ alignItems: 'center' }}>
          <Link href="/(auth)/sign-in">
            <Text variant="subhead" color="accent">
              I already have an account
            </Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
