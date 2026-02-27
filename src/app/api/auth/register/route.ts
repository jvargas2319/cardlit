import { NextRequest, NextResponse } from 'next/server';
import { prisma, withRetry } from '@/lib/db';
import { hashPassword, createToken, setAuthCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await withRetry(() => prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    }));

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Email already registered' },
        { status: 400 }
      );
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await withRetry(() => prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
      },
    }));

    // Create token and set cookie
    const token = await createToken(user.id);
    await setAuthCookie(token);

    return NextResponse.json({
      success: true,
      data: { userId: user.id, email: user.email },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create account' },
      { status: 500 }
    );
  }
}
