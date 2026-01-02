/**
 * Club 19 Sales OS - Error Management Tools
 *
 * Admin functions for resolving errors, clearing sale error flags,
 * and managing error lifecycle
 */

import { getXataClient } from "@/src/xata";
import * as logger from './logger';

// ============================================================================
// CLIENT SINGLETON
// ============================================================================

let _xata: ReturnType<typeof getXataClient> | null = null;

export function xata() {
  if (_xata) return _xata;
  _xata = getXataClient();
  return _xata;
}

// ============================================================================
// ADMIN RESOLUTION FUNCTIONS
// ============================================================================

/**
 * Resolve an error record
 *
 * Marks an error as resolved with admin details and timestamp
 * Does NOT automatically clear the sale error_flag (admin decides manually)
 *
 * @param errorId - Error record ID
 * @param adminEmail - Email of admin resolving the error
 * @param notes - Optional resolution notes
 * @returns Success result
 */
export async function resolveError(
  errorId: string,
  adminEmail: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  logger.info('ERRORS', `Resolving error ${errorId} by ${adminEmail}`);

  try {
    await xata().db.Errors.update(errorId, {
      resolved: true,
      resolved_by: adminEmail,
      resolved_at: new Date(),
      resolved_notes: notes || undefined,
    });

    logger.info('ERRORS', `Error ${errorId} resolved`);

    return { success: true };
  } catch (err: any) {
    logger.error('ERRORS', 'Failed to resolve error', err);
    return {
      success: false,
      error: `Failed to resolve error: ${err.message || err}`,
    };
  }
}

/**
 * Clear error flag from a sale
 *
 * Resets the sale's error_flag to false and clears error_message
 * Use this after errors have been resolved and sale data is clean
 *
 * @param saleId - Sale record ID
 * @returns Success result
 */
export async function clearSaleErrorFlag(
  saleId: string
): Promise<{ success: boolean; error?: string }> {
  logger.info('ERRORS', `Clearing error flag for sale ${saleId}`);

  try {
    await xata().db.Sales.update(saleId, {
      error_flag: false,
      error_message: [],
    });

    logger.info('ERRORS', `Sale ${saleId} error flag cleared`);

    return { success: true };
  } catch (err: any) {
    logger.error('ERRORS', 'Failed to clear sale error flag', err);
    return {
      success: false,
      error: `Failed to clear sale error flag: ${err.message || err}`,
    };
  }
}

/**
 * Resolve all errors for a specific sale
 *
 * Finds all unresolved errors linked to a sale and resolves them
 * Useful for bulk resolution when a sale issue has been fixed
 *
 * @param saleId - Sale record ID
 * @param adminEmail - Email of admin resolving the errors
 * @returns List of resolved error IDs
 */
export async function resolveAllErrorsForSale(
  saleId: string,
  adminEmail: string
): Promise<{ success: boolean; resolvedIds: string[]; error?: string }> {
  logger.info('ERRORS', `Resolving all errors for sale ${saleId}`);

  try {
    // Find all unresolved errors for this sale
    const unresolvedErrors = await xata()
      .db.Errors.filter({
        "sale.id": saleId,
        resolved: false,
      })
      .getMany();

    logger.info('ERRORS', `Found ${unresolvedErrors.length} unresolved errors for sale ${saleId}`);

    const resolvedIds: string[] = [];

    // Resolve each error
    for (const error of unresolvedErrors) {
      const result = await resolveError(
        error.id,
        adminEmail,
        `Bulk resolution for sale ${saleId}`
      );

      if (result.success) {
        resolvedIds.push(error.id);
      } else {
        logger.warn('ERRORS', `Failed to resolve error ${error.id}: ${result.error}`);
      }
    }

    logger.info('ERRORS', `Resolved ${resolvedIds.length}/${unresolvedErrors.length} errors`);

    return {
      success: true,
      resolvedIds,
    };
  } catch (err: any) {
    logger.error('ERRORS', 'Failed to resolve sale errors', err);
    return {
      success: false,
      resolvedIds: [],
      error: `Failed to resolve sale errors: ${err.message || err}`,
    };
  }
}

/**
 * Get error count by type
 *
 * Returns count of errors grouped by error_type
 * Useful for dashboard statistics
 */
export async function getErrorCountsByType(): Promise<
  Record<string, number>
> {
  logger.info('ERRORS', 'Getting error counts by type');

  try {
    const errors = await xata().db.Errors.getMany();

    const counts: Record<string, number> = {};

    for (const error of errors) {
      const type = error.error_type || "unknown";
      counts[type] = (counts[type] || 0) + 1;
    }

    logger.info('ERRORS', 'Error counts', counts);

    return counts;
  } catch (err: any) {
    logger.error('ERRORS', 'Failed to get error counts', err);
    return {};
  }
}

/**
 * Get unresolved error count
 *
 * Returns total count of unresolved errors
 */
export async function getUnresolvedErrorCount(): Promise<number> {
  try {
    const errors = await xata()
      .db.Errors.filter({ resolved: false })
      .getMany();

    return errors.length;
  } catch (err: any) {
    logger.error('ERRORS', 'Failed to get unresolved error count', err);
    return 0;
  }
}
