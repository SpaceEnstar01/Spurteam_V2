#import <Foundation/Foundation.h>
#import "../../native-sdk/ios/SpurRingReconnect.h"

@interface FakeRingTransport : NSObject <SpurRingReconnectTransport>
@property BOOL desired;
@property BOOL powered;
@property BOOL hasPeripheral;
@property BOOL pending;
@property BOOL autoEnabled;
@property BOOL blocked;
@property BOOL systemConnectedWithoutSDK;
@property NSString *selected;
@property NSString *pairedMAC;
@property NSString *pairedUUID;
@property NSMutableArray<NSString *> *operations;
@end
@implementation FakeRingTransport
- (instancetype)init {
  if ((self = [super init])) {
    _desired = YES; _powered = YES; _autoEnabled = YES;
    _selected = @"AA:01"; _pairedMAC = @"AA:01";
    _pairedUUID = @"86AB3D10-55E0-43CD-A550-123456789012";
    _operations = [NSMutableArray array];
  }
  return self;
}
- (BOOL)spurCanResume { return self.desired && self.powered && !self.blocked && SpurRingIdentifierMatches(self.selected, self.pairedMAC, self.pairedUUID); }
- (BOOL)spurHasCurrentPeripheral { return self.hasPeripheral; }
- (BOOL)spurConnectionInFlight { return self.pending; }
- (BOOL)spurNeedsServiceAttachment { return self.systemConnectedWithoutSDK && self.hasPeripheral && !self.pending; }
- (BOOL)spurAutoReconnectEnabled { return self.autoEnabled; }
- (void)spurRestorePairedPeripheral { [self.operations addObject:@"restoreUUID"]; self.hasPeripheral = YES; self.pending = self.autoEnabled && !self.systemConnectedWithoutSDK; }
- (void)spurEnableAutoReconnect { [self.operations addObject:@"enable"]; self.autoEnabled = YES; self.pending = YES; }
- (void)spurReconnect { [self.operations addObject:@"connect"]; self.pending = YES; }
@end

int main(void) {
  @autoreleasepool {
    // App restarted outside the case; there are no scan results or cached CBPeripheral.
    FakeRingTransport *restart = [FakeRingTransport new];
    SpurResumePairedRing(restart);
    NSCAssert([restart.operations isEqual:@[@"restoreUUID"]], @"Reconnect from persisted UUID without scanning/binding");
    SpurResumePairedRing(restart);
    NSCAssert(restart.operations.count == 1, @"Lifecycle echoes cannot restart a pending native connection");

    // iOS retained the physical connection across relaunch, but SDK callbacks
    // are absent. Restoring that UUID must attach services/auth, not wait forever.
    FakeRingTransport *detached = [FakeRingTransport new];
    detached.systemConnectedWithoutSDK = YES;
    SpurResumePairedRing(detached);
    NSCAssert(([detached.operations isEqual:@[@"restoreUUID", @"connect"]]), @"Reattach the SDK to an existing system BLE connection");

    // BLE disconnect wakes a locked app; issue the native request immediately.
    FakeRingTransport *locked = [FakeRingTransport new];
    locked.hasPeripheral = YES;
    SpurResumePairedRing(locked);
    NSCAssert([locked.operations isEqual:@[@"connect"]], @"Reconnect without foreground entry or a JS timer");
    locked.pending = NO; // A second real link loss is eligible for one more request.
    SpurResumePairedRing(locked);
    NSCAssert(locked.operations.count == 2, @"Recover a subsequent BLE disconnect");

    // A manual disconnect previously disabled SDK auto-reconnect across launches.
    FakeRingTransport *disabled = [FakeRingTransport new];
    disabled.autoEnabled = NO;
    SpurResumePairedRing(disabled);
    NSCAssert(([disabled.operations isEqual:@[@"restoreUUID", @"enable"]]), @"Restore before enabling; do not add a duplicate reconnect");
    FakeRingTransport *cached = [FakeRingTransport new];
    cached.autoEnabled = NO; cached.hasPeripheral = YES;
    SpurResumePairedRing(cached);
    NSCAssert([cached.operations isEqual:@[@"enable"]], @"Enabling auto-reconnect already dispatches the connection");

    for (NSNumber *reason in @[@0, @1, @2, @3]) {
      FakeRingTransport *ineligible = [FakeRingTransport new];
      switch (reason.intValue) {
        case 0: ineligible.desired = NO; break;
        case 1: ineligible.powered = NO; break;
        case 2: ineligible.blocked = YES; break;
        case 3: ineligible.selected = @"OTHER"; break;
      }
      SpurResumePairedRing(ineligible);
      NSCAssert(ineligible.operations.count == 0, @"Respect user disconnect, radio state, binding rejection and device identity");
    }
    FakeRingTransport *uuid = [FakeRingTransport new];
    uuid.selected = uuid.pairedUUID.lowercaseString;
    SpurResumePairedRing(uuid);
    NSCAssert(uuid.operations.count == 1, @"Recognize a saved UUID as the existing bond");
    NSCAssert(!SpurRingIdentifierMatches(@"", @"", @""), @"Empty identifiers cannot match a device");
    puts("Native ring reconnect scenarios passed (restart, screen lock, duplicate events, cancellation, binding rejection, UUID identity)");
  }
}
