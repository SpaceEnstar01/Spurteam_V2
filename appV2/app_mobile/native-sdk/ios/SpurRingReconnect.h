#pragma once
#import <Foundation/Foundation.h>

// A saved UUID/MAC identifies an existing bond. Reconnecting it must never
// enter the scan-dependent binding path, including while the screen is locked.
static inline BOOL SpurRingIdentifierMatches(NSString *identifier, NSString *mac, NSString *uuid) {
  if (identifier.length == 0) return NO;
  return (mac.length > 0 && [identifier caseInsensitiveCompare:mac] == NSOrderedSame) ||
         (uuid.length > 0 && [identifier caseInsensitiveCompare:uuid] == NSOrderedSame);
}

@protocol SpurRingReconnectTransport <NSObject>
- (BOOL)spurCanResume;
- (BOOL)spurHasCurrentPeripheral;
- (BOOL)spurConnectionInFlight;
- (BOOL)spurAutoReconnectEnabled;
- (void)spurRestorePairedPeripheral;
- (void)spurEnableAutoReconnect;
- (void)spurReconnect;
@end

// Both restoring a paired device and enabling auto-reconnect can themselves
// start a CoreBluetooth connection. Dispatch exactly one connection operation.
static inline void SpurResumePairedRing(id<SpurRingReconnectTransport> transport) {
  if (![transport spurCanResume]) return;
  if (![transport spurHasCurrentPeripheral]) [transport spurRestorePairedPeripheral];
  if (![transport spurAutoReconnectEnabled]) [transport spurEnableAutoReconnect];

  // Either SDK call may only restore the UUID or schedule a later retry.
  // Re-read the target and its BLE state before issuing a direct request.
  if ([transport spurHasCurrentPeripheral] && ![transport spurConnectionInFlight]) {
    [transport spurReconnect];
  }
}
