import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Check if user is already authenticated
  const { data: adminUser, error } = useQuery<{isAdmin: boolean, name: string, email: string}>({
    queryKey: ["/api/admin/me"],
    retry: false,
  });

  // Check if this is an actual authorization failure (not just "not logged in")
  const isAuthorizationError = error && 
    (error as any)?.response?.status === 403 || 
    (error as any)?.message?.includes('Forbidden') ||
    window.location.search.includes('error=access_denied');

  useEffect(() => {
    if (adminUser?.isAdmin) {
      // User is already authenticated, redirect to admin console
      navigate("/admin/console");
    }
  }, [adminUser, navigate]);

  const handleGoogleLogin = () => {
    // Redirect to Google OAuth
    window.location.href = "/auth/google";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Admin Access</CardTitle>
          <p className="text-muted-foreground">
            Sign in with your authorized Google account to access the admin console.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleGoogleLogin}
            className="w-full"
            size="lg"
            data-testid="button-google-login"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </Button>
          
          {isAuthorizationError && (
            <div className="text-center text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              Access denied. Please contact an administrator if you believe you should have access.
            </div>
          )}
          
          <div className="text-center text-sm text-muted-foreground">
            Only authorized email addresses can access the admin console.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}