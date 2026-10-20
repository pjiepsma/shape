import { Redirect } from 'expo-router';

/** Scoring/review lives on /camera in-place; keep route for old stack entries. */
export default function ResultScreen() {
  return <Redirect href="/camera" />;
}
