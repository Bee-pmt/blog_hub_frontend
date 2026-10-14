export type TokenResponse = { accessToken: string; expiresIn: number };

export type RegistrationInput = {
  displayName: string;
  email: string;
  password: string;
};
