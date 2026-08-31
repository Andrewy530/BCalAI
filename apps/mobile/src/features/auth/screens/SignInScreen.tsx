import { type SignInInput, signInSchema } from '@cal/schemas';
import { Button, Screen, Text, TextField, useTheme } from '@cal/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { toAppError } from '../../../lib/errors/app-error';
import { AppleSignInButton } from '../components/AppleSignInButton';
import { AuthDivider } from '../components/AuthDivider';
import { useAuthActions } from '../hooks/useAuthActions';

export function SignInScreen() {
  const theme = useTheme();
  const { signIn, apple } = useAuthActions();

  const { control, handleSubmit, formState } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const submitError = signIn.error ? toAppError(signIn.error) : null;

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ gap: theme.spacing.xxl }}
      >
        <View style={{ gap: theme.spacing.xs, paddingTop: theme.spacing.xxxl }}>
          <Text variant="display">Welcome back</Text>
          <Text variant="callout" color="secondary">
            Know what you need to do, and when you can do it.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.lg }}>
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
                returnKeyType="next"
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
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                placeholder="••••••••"
                returnKeyType="go"
                onSubmitEditing={handleSubmit((values) => signIn.mutate(values))}
              />
            )}
          />

          {submitError ? (
            <Text variant="footnote" color="danger">
              {submitError.message}
            </Text>
          ) : null}

          <Button
            label="Sign in"
            fullWidth
            loading={signIn.isPending}
            disabled={formState.isSubmitting}
            onPress={handleSubmit((values) => signIn.mutate(values))}
          />
        </View>

        <AuthDivider />

        <AppleSignInButton onPress={() => apple.mutate()} disabled={apple.isPending} />

        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <Link href="/(auth)/sign-up">
            <Text variant="subhead" color="accent">
              Create an account
            </Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
