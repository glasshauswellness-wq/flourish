import { Router, type IRouter } from "express";
import healthRouter from "./health";
import priyaRouter from "./priya";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/priya", priyaRouter);

export default router;
