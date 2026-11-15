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
- (BOOL)spurNeedsServiceAttachment;
- (BOOL)spurAutoReconnectEnabled;
- (void)spurRestorePairedPeripheral;
- (void)spurEnableAutoReconnect;
- (void)spurReconnect;
@end

// Both restoring a paired device and enabling auto-reconnect can themselves
// start a CoreBluetooth connection. Dispatch exactly one connection operation.
static inline void SpurResumePairedRing(id<SpurRingReconnectTransport> transport) {
  if (![transport spurCanResume]) return;
  if (![transport spurHasCurrentPeripheral]) {
    [transport spurRestorePairedPeripheral];
    if (![transport spurAutoReconnectEnabled]) {
      [transport spurEnableAutoReconnect];
      return;
    }
    // iOS can retain a system connection while RingSDK has not attached its
    // services/auth callbacks yet. Reattach only if restore did not start one.
    if ([transport spurNeedsServiceAttachment]) [transport spurReconnect];
    return;
  }
  if (![transport spurAutoReconnectEnabled]) {
    [transport spurEnableAutoReconnect];
    return;
  }
  if (![transport spurConnectionInFlight]) [transport spurReconnect];
}
