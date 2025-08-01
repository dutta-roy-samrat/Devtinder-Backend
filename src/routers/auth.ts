import bcrypt from "bcrypt";
import { Router, Request, Response } from "express";

import prisma from "@clients/prisma";

import { ErrorWithStatus } from "@class/error";

import { LoginSchema } from "@schema-validations/login";
import { UserSchema } from "@schema-validations/user";

import { resetPasswordMailer } from "@mailer/reset-password";

import { asyncHandler } from "@utils/async-handler";
import { setTokenInCookie, verifyAndDecodeToken } from "@utils/token";
import { getUserByUniqueConstraint } from "@utils/user";

import {
  RESET_PASSWORD_SECRET_KEY,
  SECRET_KEY,
} from "@constants/environment-variables";

const router = Router();

router.post(
  "/register",
  asyncHandler(async (req: Request, res: Response) => {
    const { success, data, error } = await UserSchema.safeParseAsync(req.body);
    if (!success) {
      console.error(error, "error");
      throw new ErrorWithStatus("Invalid input data", 400);
    }

    const hashedPassword = await bcrypt.hash(String(data.password), 10);
    const user = await prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: hashedPassword,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
      },
    });
    setTokenInCookie({ res, userId: user.id });
    return res.status(201).json({ message: "User created successfully" });
  })
);

router.post(
  "/login",
  asyncHandler(async (req: Request, res: Response) => {
    const { success, data } = await LoginSchema.safeParseAsync(req.body);
    if (!success) {
      throw new ErrorWithStatus("Invalid Credentials", 400);
    }
    const { email, password: passwordInput } = data;
    const user = await getUserByUniqueConstraint({ email });
    const { password } = user;
    const isPasswordValid = await bcrypt.compare(passwordInput, password);

    if (isPasswordValid) {
      setTokenInCookie({ res, userId: user.id });
      return res.status(200).json({ message: "User successfully logged in!" });
    }
    throw new ErrorWithStatus("Invalid credentials", 401);
  })
);

router.post(
  "/reset-password",
  asyncHandler(async (req: Request, res: Response) => {
    const { success, data } = await UserSchema.pick({
      email: true,
    }).safeParseAsync(req.body);
    if (!success) {
      throw new ErrorWithStatus("Invalid email format", 400);
    }

    const { email } = data;
    const user = await getUserByUniqueConstraint({ email });
    await resetPasswordMailer({ email, id: user.id });
    return res.status(200).json({ message: "Password reset email sent" });
  })
);

router.post(
  "/set-new-password",
  asyncHandler(async (req: Request, res: Response) => {
    const { success, data } = UserSchema.pick({
      password: true,
    }).safeParse(req.body);
    if (!success) {
      throw new ErrorWithStatus("Invalid password format", 400);
    }

    const { password } = data;
    const token = req.query.token;

    if (!token) {
      throw new ErrorWithStatus("Token is missing", 400);
    }

    const decodedToken = verifyAndDecodeToken({
      token: token as string,
      secretKey: RESET_PASSWORD_SECRET_KEY,
    });

    if (decodedToken) {
      const { id } = decodedToken;

      const hashedPassword = await bcrypt.hash(password, 10);

      await prisma.user.update({
        where: {
          id,
        },
        data: {
          password: hashedPassword,
        },
      });

      return res.status(200).json({ message: "Password successfully updated" });
    }
  })
);

router.post(
  "/logout",
  asyncHandler(async (req: Request, res: Response) => {
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    return res.status(200).json({ message: "User successfully logged out" });
  })
);

router.post(
  "/refresh-token",
  asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken) {
      throw new ErrorWithStatus("Refresh token missing", 401);
    }
    let decoded;
    try {
      decoded = verifyAndDecodeToken({
        token: refreshToken,
        secretKey: SECRET_KEY,
      });
    } catch (err) {
      throw new ErrorWithStatus("Invalid refresh token", 401);
    }
    if (!decoded || !decoded.id) {
      throw new ErrorWithStatus("Invalid refresh token payload", 401);
    }
    setTokenInCookie({ res, userId: decoded.id });
    return res.status(200).json({ message: "Token refreshed successfully" });
  })
);

export default router;
