import jwt from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";

import { setTokenInCookie, verifyAndDecodeToken } from "@utils/token";

import { ErrorWithStatus } from "class/error";

import { SECRET_KEY } from "@constants/environment-variables";
import { asyncHandler } from "@utils/async-handler";

const validateRefreshToken = async ({
  refreshToken,
  req,
  res,
}: {
  refreshToken: string;
  res: Response;
  req: Request;
}) => {
  if (refreshToken) {
    try {
      jwt.verify(refreshToken, SECRET_KEY);
      const decoded = jwt.decode(refreshToken);
      if (decoded && typeof decoded !== "string" && "id" in decoded) {
        const { id } = decoded;
        setTokenInCookie({ res, userId: id });
        req.userId = Number(id);
      }
    } catch {
      throw new ErrorWithStatus("Unauthorized Access", 401);
    }
  }
};

export const JWTAuthentication = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { accessToken, refreshToken } = req.cookies;
    if (!accessToken || !refreshToken)
      throw new ErrorWithStatus("Unauthorized Access", 401);
    if (accessToken) {
      try {
        const decodedToken = verifyAndDecodeToken({
          secretKey: SECRET_KEY,
          token: accessToken,
        });
        if (decodedToken) {
          const { id } = decodedToken;
          req.userId = Number(id);
          return next();
        }
      } catch {
        await validateRefreshToken({ res, refreshToken, req });
        return next();
      }
    }
    await validateRefreshToken({ refreshToken, res, req });
    return next();
  }
);
