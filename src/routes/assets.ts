import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import storage from '../storage';
import database from '../database';
import sharp, { ResizeOptions } from 'sharp';
import { SYSTEM_ASSET_WHITELIST } from '../constants';
import { InvalidQueryException, ItemNotFoundException } from '../exceptions';
import * as AssetsService from '../services/assets';
import validate from 'uuid-validate';

const router = Router();

router.get(
	'/:pk',

	// Check if file exists
	asyncHandler(async (req, res, next) => {
		const id = req.params.pk;

		/**
		 * This is a little annoying. Postgres will error out if you're trying to search in `where`
		 * with a wrong type. In case of directus_files where id is a uuid, we'll have to verify the
		 * validity of the uuid ahead of time.
		 * @todo move this to a validation middleware function
		 */
		const isValidUUID = validate(id);
		if (isValidUUID === false) throw new ItemNotFoundException(id, 'directus_files');

		const file = await database.select('id').from('directus_files').where({ id });

		if (!file) throw new ItemNotFoundException(id, 'directus_files');

		return next();
	}),

	// Validate query params
	asyncHandler(async (req, res, next) => {
		const defaults = { asset_shortcuts: '[]', asset_generation: 'all' };
		const assetSettings =
			(await database
				.select('asset_shortcuts', 'asset_generation')
				.from('directus_settings')
				.first()) || defaults;

		const systemKeys = SYSTEM_ASSET_WHITELIST.map((size) => size.key);
		const allKeys: string[] = [
			...systemKeys,
			...assetSettings.asset_shortcuts.map((size) => size.key),
		];

		if (assetSettings.asset_generation === 'all') {
			return next();
		} else if (assetSettings.asset_generation === 'shortcut') {
			if (allKeys.includes(req.query.key as string)) return next();
			throw new InvalidQueryException(
				`Only configured shortcuts can be used in asset generation.`
			);
		} else {
			if (systemKeys.includes(req.query.key as string)) return next();
			throw new InvalidQueryException(
				`Dynamic asset generation has been disabled for this project.`
			);
		}
	}),

	// Return file
	asyncHandler(async (req, res) => {
		const { stream, file } = await AssetsService.getAsset(req.params.pk, req.query);

		res.setHeader('Content-Disposition', 'attachment; filename=' + file.filename_download);
		res.setHeader('Content-Type', file.type);

		stream.pipe(res);
	})
);

export default router;
